import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { MAX_IMAGE_BYTES, UploadsService } from './uploads.service.js';
import type { UploadFileInput } from './image-storage.js';

@ApiTags('admin/uploads')
@ApiBearerAuth()
@Roles(Role.Admin)
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @ApiOperation({
    summary: 'Upload one product image (multipart) and return its URL',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({
    description: '`{ url, publicId, provider }` — Mongo stores only these',
  })
  @UseInterceptors(
    // No `storage` option: multer's default memory storage buffers the file
    // (capped at 5 MB) so it can be handed straight to the storage provider.
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }),
  )
  uploadImage(@UploadedFile() file: UploadFileInput | undefined) {
    return this.uploadsService.uploadImage(file);
  }
}
