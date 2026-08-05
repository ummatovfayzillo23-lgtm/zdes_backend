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
import { CreateEmployeeLeaveDto } from './dto/create-employee-leave.dto';
import { EmployeeLeaveQueryDto } from './dto/employee-leave-query.dto';
import { RequestEmployeeLeaveDto } from './dto/request-employee-leave.dto';
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';
import { EmployeeLeaveService } from './employee-leave.service';

@ApiTags('Employee Leave')
@ApiBearerAuth()
@Controller('employee-leaves')
export class EmployeeLeaveController {
  constructor(private readonly employeeLeaveService: EmployeeLeaveService) {}

  @Post()
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Grant leave directly (already approved) - superadmin, admin',
  })
  create(
    @Body() dto: CreateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.create(dto, actor);
  }

  @Post('request')
  @Roles('employee')
  @ApiOperation({ summary: "Request leave (pending approval) - employee" })
  request(
    @Body() dto: RequestEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.request(dto, actor);
  }

  @Patch(':id/approve')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Approve a pending leave request - superadmin, admin, manager',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.approve(id, actor);
  }

  @Patch(':id/reject')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Reject a pending leave request - superadmin, admin, manager',
  })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.reject(id, actor);
  }

  @Get()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary:
      'Get employee leaves - superadmin, admin, manager, employee (own only)',
  })
  findAll(
    @Query() query: EmployeeLeaveQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findAll(query, actor);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({
    summary:
      'Get employee leave by id - superadmin, admin, manager, employee (own only)',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findOne(id, actor);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Update employee leave - superadmin, admin',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({
    summary: 'Delete employee leave - superadmin, admin',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.delete(id, actor);
  }
}
