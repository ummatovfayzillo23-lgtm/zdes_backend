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
@ApiBearerAuth()
@Roles('superadmin', 'admin')
@Controller('settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Post()
  @ApiOperation({ summary: 'Create setting - superadmin, admin' })
  create(
    @Body() dto: CreateSettingDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get settings - superadmin, admin' })
  findAll(
    @Query() query: SettingQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get setting by id - superadmin, admin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update setting - superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete setting - superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.settingService.delete(id, actor);
  }
}
