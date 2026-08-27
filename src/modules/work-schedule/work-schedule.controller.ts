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
import { AssignUserDto } from './dto/assign-user.dto';
import { AttachCompanyDto } from './dto/attach-company.dto';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { ToggleWorkScheduleStatusDto } from './dto/toggle-work-schedule-status.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkScheduleQueryDto } from './dto/work-schedule-query.dto';
import { WorkScheduleService } from './work-schedule.service';

@ApiTags('Work Schedules')
@Controller('work-schedules')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  create(
    @Body() dto: CreateWorkScheduleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findAll(
    @Query() query: WorkScheduleQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleWorkScheduleStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.toggleStatus(id, dto, actor);
  }

  @Post(':id/companies')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  attachCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachCompanyDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.attachCompany(id, dto, actor);
  }

  @Delete(':id/companies/:companyId')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  detachCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.detachCompany(id, companyId, actor);
  }

  @Patch(':id/companies/:companyId/set-default')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  setDefaultForCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.setDefaultForCompany(id, companyId, actor);
  }

  @Patch(':id/assign-user')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.assignUser(id, dto, actor);
  }

  @Patch(':id/unassign-user')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.unassignUser(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.delete(id, actor);
  }
}
