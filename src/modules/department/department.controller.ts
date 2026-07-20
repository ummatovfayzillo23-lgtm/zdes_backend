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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';
import { ToggleDepartmentStatusDto } from './dto/toggle-department-status.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentService } from './department.service';

@ApiTags('Departments')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create department - superadmin, admin (own company), manager (own branch)',
  })
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary:
      'Get departments - superadmin (all), admin (own company), manager (own branch)',
  })
  findAll(
    @Query() query: DepartmentQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get department by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update department - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({
    summary: 'Toggle department status - superadmin, admin, manager',
  })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleDepartmentStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.toggleStatus(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete department - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.departmentService.delete(id, actor);
  }
}
