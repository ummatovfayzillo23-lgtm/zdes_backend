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
  CreateTaskDto,
  CreateTaskProjectDto,
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
@ApiBearerAuth()
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'Create new task - superadmin, admin, manager, employee',
  })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AccessTokenPayload) {
    return this.taskService.create(actor, dto);
  }

  @Get()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary:
      'Get tasks with filtering, search, and view projections (list, board, calendar, grid)',
  })
  findAll(
    @Query() query: TaskQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findAll(actor, query);
  }

  // TaskProject endpoints (Declared before /:id routes to avoid route collisions)
  @Post('projects')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Create task project / teamspace folder - superadmin, admin, manager',
  })
  createProject(
    @Body() dto: CreateTaskProjectDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.createProject(actor, dto);
  }

  @Get('projects')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'List task projects - superadmin, admin, manager, employee',
  })
  findAllProjects(
    @Query() query: TaskProjectQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findAllProjects(actor, query.companyId, query);
  }

  @Get('projects/:id')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'Get task project by ID - superadmin, admin, manager, employee',
  })
  findProjectById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findProjectById(actor, id);
  }

  @Patch('projects/:id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Update task project - superadmin, admin, manager',
  })
  updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskProjectDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateProject(actor, id, dto);
  }

  @Delete('projects/:id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Delete task project - superadmin, admin, manager',
  })
  removeProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.removeProject(actor, id);
  }

  // Reorder endpoint (Declared before /:id route)
  @Patch('reorder')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'Batch update task order positions and statuses (drag-and-drop)',
  })
  reorder(
    @Body() dto: ReorderTasksDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.reorder(actor, dto);
  }

  // Specific Task item endpoints
  @Get(':id')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'Get task details by ID - superadmin, admin, manager, employee',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.findOne(actor, id);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary: 'Update task details - superadmin, admin, manager',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.update(actor, id, dto);
  }

  @Patch(':id/status')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary:
      'Quick toggle task status - superadmin, admin, manager, assigned employee',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateStatus(actor, id, dto);
  }

  @Patch(':id/assignees')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Update task assignees - superadmin, admin, manager',
  })
  updateAssignees(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskAssigneesDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.updateAssignees(actor, id, dto);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Delete task - superadmin, admin, manager',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.taskService.remove(actor, id);
  }
}
