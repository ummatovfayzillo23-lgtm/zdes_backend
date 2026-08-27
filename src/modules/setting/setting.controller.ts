import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateSettingDto } from './dto/create-setting.dto';
import { SettingQueryDto } from './dto/setting-query.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingService } from './setting.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  create(
    @Body() dto: CreateSettingDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findAll(
    @Query() query: SettingQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.delete(id, actor);
  }
}
