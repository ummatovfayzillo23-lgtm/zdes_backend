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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import {
  CreateSelfTaskDto,
  CreateTaskDto,
  CreateTaskProjectDto,
  MyTasksQueryDto,
  ReorderTasksDto,
  TaskProjectQueryDto,
  TaskQueryDto,
  UpdateTaskAssigneesDto,
  UpdateTaskDto,
  UpdateTaskProjectDto,
  UpdateTaskStatusDto,
} from './dto';
import { TaskService } from './task.service';

@ApiTags('Tasks')
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('self')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  createSelf(
    @Body() dto: CreateSelfTaskDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.createSelf(actor, dto);
  }

  @Get('my')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findMyTasks(
    @Query() query: MyTasksQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findMyTasks(actor, query);
  }

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.taskService.create(actor, dto);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findAll(
    @Query() query: TaskQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findAll(actor, query);
  }

  @Post('projects')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  createProject(
    @Body() dto: CreateTaskProjectDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.createProject(actor, dto);
  }

  @Get('projects')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findAllProjects(
    @Query() query: TaskProjectQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findAllProjects(actor, query.companyId, query);
  }

  @Get('projects/:id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findProjectById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findProjectById(actor, id);
  }

  @Patch('projects/:id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskProjectDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateProject(actor, id, dto);
  }

  @Delete('projects/:id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  removeProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.removeProject(actor, id);
  }

  @Patch('reorder')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  reorder(
    @Body() dto: ReorderTasksDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.reorder(actor, dto);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findOne(actor, id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.update(actor, id, dto);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateStatus(actor, id, dto);
  }

  @Patch(':id/assignees')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  updateAssignees(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskAssigneesDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateAssignees(actor, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.remove(actor, id);
  }
}
