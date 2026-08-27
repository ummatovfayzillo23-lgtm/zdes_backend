import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { imageUploadOptions } from '../../common/upload/image-upload.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ToggleUserBlockedDto } from './dto/toggle-user-blocked.dto';
import { ToggleUserStatusDto } from './dto/toggle-user-status.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.userService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: UserQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.findOne(id, actor);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  updateOwnProfile(
    @Body() dto: UpdateOwnProfileDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.updateOwnProfile(actor, dto);
  }

  @Post('me/avatar')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('avatars')))
  uploadOwnAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.updateOwnAvatar(actor, file);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.update(id, dto, actor);
  }

  @Post(':id/avatar')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('avatars')))
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.updateAvatar(id, actor, file);
  }

  @Post(':id/face-image')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('faces')))
  uploadFaceImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.updateFaceImage(id, actor, file);
  }

  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleUserStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.toggleStatus(id, dto, actor);
  }

  @Patch(':id/toggle-blocked')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  toggleBlocked(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleUserBlockedDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.toggleBlocked(id, dto, actor);
  }

  @Patch(':id/change-password')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.changePassword(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.delete(id, actor);
  }
}
