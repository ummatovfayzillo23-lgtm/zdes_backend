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
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';
import { EmployeeLeaveService } from './employee-leave.service';

@ApiTags('Employee Leave')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('employee-leaves')
export class EmployeeLeaveController {
  constructor(private readonly employeeLeaveService: EmployeeLeaveService) {}

  @Post()
  @ApiOperation({
    summary: 'Create employee leave - superadmin, admin, manager',
  })
  create(
    @Body() dto: CreateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get employee leaves - superadmin, admin, manager' })
  findAll(
    @Query() query: EmployeeLeaveQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get employee leave by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update employee leave - superadmin, admin, manager',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeLeaveDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete employee leave - superadmin, admin, manager',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.employeeLeaveService.delete(id, actor);
  }
}
