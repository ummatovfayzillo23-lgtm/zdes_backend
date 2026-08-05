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
@ApiBearerAuth()
@Roles('superadmin', 'admin')
@Controller('work-schedules')
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  @Post()
  @ApiOperation({
    summary: 'Create work schedule - superadmin, admin (own company)',
  })
  create(
    @Body() dto: CreateWorkScheduleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary:
      'Get work schedules - superadmin (all), admin (schedules attached to own company)',
  })
  findAll(
    @Query() query: WorkScheduleQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get work schedule by id, including every company it is attached to - superadmin, admin',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update work schedule - superadmin, admin (owning company only)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({
    summary:
      'Toggle work schedule status - superadmin, admin (owning company only)',
  })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleWorkScheduleStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.toggleStatus(id, dto, actor);
  }

  @Post(':id/companies')
  @Roles('superadmin')
  @ApiOperation({
    summary:
      'Attach an existing work schedule to another company for reuse - superadmin only',
  })
  attachCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachCompanyDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.attachCompany(id, dto, actor);
  }

  @Delete(':id/companies/:companyId')
  @ApiOperation({
    summary:
      'Detach a work schedule from a company (not the owning company) - superadmin, admin (own company)',
  })
  detachCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.detachCompany(id, companyId, actor);
  }

  @Patch(':id/companies/:companyId/set-default')
  @ApiOperation({
    summary:
      'Set work schedule as the default for a specific company - superadmin, admin (own company)',
  })
  setDefaultForCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.setDefaultForCompany(id, companyId, actor);
  }

  @Patch(':id/assign-user')
  @ApiOperation({
    summary: 'Assign work schedule to a user - superadmin, admin',
  })
  assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.assignUser(id, dto, actor);
  }

  @Patch(':id/unassign-user')
  @ApiOperation({
    summary: 'Remove work schedule from a user - superadmin, admin',
  })
  unassignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.unassignUser(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete work schedule - superadmin, admin (owning company only)',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.delete(id, actor);
  }
}
