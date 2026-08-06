import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../database/prisma.service';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

export type UploadedFileLike = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const attachmentInclude = {
  enviadoPor: { include: { user: true } },
  tarefa: true,
} satisfies Prisma.TaskAttachmentInclude;

type AttachmentWithRelations = Prisma.TaskAttachmentGetPayload<{
  include: typeof attachmentInclude;
}>;

function formatAttachment(a: AttachmentWithRelations) {
  const downloadUrl = a.arquivoUrl ?? a.url ?? '';
  const lower = (a.arquivoUrl ?? a.nome ?? '').toLowerCase();

  return {
    ...a,
    data_upload: a.dataUpload,
    download_url: downloadUrl,
    is_image: IMAGE_EXTENSIONS.some((ext) => lower.includes(ext)),
    enviado_por: a.enviadoPor
      ? {
          ...a.enviadoPor,
          usuario: a.enviadoPor.user
            ? {
                ...a.enviadoPor.user,
                first_name: a.enviadoPor.user.firstName ?? '',
                last_name: a.enviadoPor.user.lastName ?? '',
                get_full_name:
                  [a.enviadoPor.user.firstName, a.enviadoPor.user.lastName]
                    .filter(Boolean)
                    .join(' ') || a.enviadoPor.user.username,
              }
            : null,
          user: undefined,
        }
      : null,
    enviadoPor: undefined,
  };
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly cloudinaryEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.cloudinaryEnabled = Boolean(cloudName && apiKey && apiSecret);
    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary não configurado: o upload de arquivos ficará desabilitado (links continuam funcionando).',
      );
    }
  }

  get isUploadEnabled() {
    return this.cloudinaryEnabled;
  }

  async listByTask(tarefaId: number) {
    const anexos = await this.prisma.taskAttachment.findMany({
      where: { tarefaId },
      include: attachmentInclude,
      orderBy: { dataUpload: 'desc' },
    });
    return anexos.map(formatAttachment);
  }

  async getById(id: number) {
    const anexo = await this.prisma.taskAttachment.findUnique({
      where: { id },
      include: attachmentInclude,
    });
    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    return formatAttachment(anexo);
  }

  async addLink(tarefaId: number, nome: string, url: string, memberId: number) {
    await this.assertTaskExists(tarefaId);

    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException(
        'O link precisa comecar com http ou https.',
      );
    }

    const anexo = await this.prisma.taskAttachment.create({
      data: {
        tarefaId,
        tipo: 'link',
        nome,
        url,
        enviadoPorId: memberId,
      },
      include: attachmentInclude,
    });
    return formatAttachment(anexo);
  }

  async addFile(
    tarefaId: number,
    nome: string,
    file: UploadedFileLike | undefined,
    memberId: number,
  ) {
    await this.assertTaskExists(tarefaId);

    if (!file) {
      throw new BadRequestException('Selecione um arquivo para enviar.');
    }
    if (!this.cloudinaryEnabled) {
      throw new BadRequestException(
        'O upload de arquivos não está configurado neste ambiente. Adicione as credenciais do Cloudinary ou use um link.',
      );
    }

    const uploaded = await this.uploadToCloudinary(file, tarefaId);

    const anexo = await this.prisma.taskAttachment.create({
      data: {
        tarefaId,
        tipo: 'arquivo',
        nome,
        arquivoUrl: uploaded.secure_url,
        arquivoPublicId: uploaded.public_id,
        enviadoPorId: memberId,
      },
      include: attachmentInclude,
    });
    return formatAttachment(anexo);
  }

  async update(id: number, data: { nome?: string; url?: string }) {
    const existing = await this.prisma.taskAttachment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    if (data.url && !/^https?:\/\//i.test(data.url)) {
      throw new BadRequestException(
        'O link precisa comecar com http ou https.',
      );
    }

    const anexo = await this.prisma.taskAttachment.update({
      where: { id },
      data: {
        nome: data.nome,
        // So faz sentido trocar a URL de anexos do tipo link.
        url: existing.tipo === 'link' ? data.url : existing.url,
      },
      include: attachmentInclude,
    });
    return formatAttachment(anexo);
  }

  async delete(id: number) {
    const anexo = await this.prisma.taskAttachment.findUnique({
      where: { id },
    });
    if (!anexo) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    if (this.cloudinaryEnabled && anexo.arquivoPublicId) {
      try {
        await cloudinary.uploader.destroy(anexo.arquivoPublicId, {
          resource_type: 'auto',
        });
      } catch (error) {
        // O registro ainda deve sumir do painel mesmo se o Cloudinary falhar.
        this.logger.warn(
          `Falha ao remover ${anexo.arquivoPublicId} do Cloudinary: ${String(error)}`,
        );
      }
    }

    await this.prisma.taskAttachment.delete({ where: { id } });
    return { ok: true, tarefaId: anexo.tarefaId };
  }

  private async assertTaskExists(tarefaId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: tarefaId } });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
  }

  private uploadToCloudinary(file: UploadedFileLike, tarefaId: number) {
    return new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `clube/tarefas/${tarefaId}`,
            resource_type: 'auto',
            filename_override: file.originalname,
          },
          (error, result) => {
            if (error || !result) {
              reject(
                new BadRequestException(
                  'Não foi possivel enviar o arquivo. Tente novamente.',
                ),
              );
              return;
            }
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id,
            });
          },
        );
        stream.end(file.buffer);
      },
    );
  }
}
