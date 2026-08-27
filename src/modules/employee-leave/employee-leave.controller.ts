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
@Controller('employee-leaves')
export class EmployeeLeaveController {
  constructor(private readonly employeeLeaveService: EmployeeLeaveService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  create(
    @Body() dto: CreateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.create(dto, actor);
  }

  @Post('request')
  @ApiBearerAuth()
  @Roles('employee')
  @ApiOperation({ summary: 'employee' })
  request(
    @Body() dto: RequestEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.request(dto, actor);
  }

  @Patch(':id/approve')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.approve(id, actor);
  }

  @Patch(':id/reject')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.reject(id, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findAll(
    @Query() query: EmployeeLeaveQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'superadmin, admin, manager, employee' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.delete(id, actor);
  }
}
