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
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Create user - superadmin, admin (own company)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.userService.create(dto, actor);
  }

  @Get()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Get users - superadmin (all), admin (own company), manager (own branch employees)',
  })
  findAll(
    @Query() query: UserQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.findAll(query, actor);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get user by id - superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.findOne(id, actor);
  }

  @Patch('me')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update own profile - superadmin, admin, manager' })
  updateOwnProfile(
    @Body() dto: UpdateOwnProfileDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.updateOwnProfile(actor, dto);
  }

  @Post('me/avatar')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Upload own avatar - superadmin, admin, manager' })
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
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Update user - superadmin, admin (own company), manager (own branch employees)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.update(id, dto, actor);
  }

  @Post(':id/avatar')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Upload avatar for a user - superadmin, admin (own company), manager (own branch employees)',
  })
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
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary:
      'Upload face recognition reference image for a user - superadmin, admin (own company)',
  })
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
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Toggle user status - superadmin, admin, manager (own branch employees)',
  })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleUserStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.toggleStatus(id, dto, actor);
  }

  @Patch(':id/toggle-blocked')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Toggle user blocked state - superadmin, admin, manager (own branch employees)',
  })
  toggleBlocked(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleUserBlockedDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.toggleBlocked(id, dto, actor);
  }

  @Patch(':id/change-password')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Change user password - superadmin, admin (own company)',
  })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.changePassword(id, dto, actor);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user - superadmin, admin (own company)' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.userService.delete(id, actor);
  }
}
