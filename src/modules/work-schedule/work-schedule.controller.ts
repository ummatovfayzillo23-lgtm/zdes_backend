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
    summary: 'Get work schedules - superadmin (all), admin (own company)',
  })
  findAll(
    @Query() query: WorkScheduleQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work schedule by id - superadmin, admin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update work schedule - superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkScheduleDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle work schedule status - superadmin, admin' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleWorkScheduleStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.toggleStatus(id, dto, actor);
  }

  @Patch(':id/set-default')
  @ApiOperation({
    summary: 'Set work schedule as company default - superadmin, admin',
  })
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.setDefault(id, actor);
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
  @ApiOperation({ summary: 'Delete work schedule - superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.workScheduleService.delete(id, actor);
  }
}
