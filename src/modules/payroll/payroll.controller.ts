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
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { PayrollStatsQueryDto } from './dto/payroll-stats-query.dto';
import { RecordPayrollPaymentDto } from './dto/record-payroll-payment.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { PayrollService } from './payroll.service';

@ApiTags('Payrolls')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('payrolls')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @ApiOperation({ summary: 'Create payroll - superadmin, admin, manager' })
  create(
    @Body() dto: CreatePayrollDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get payrolls - superadmin, admin, manager' })
  findAll(
    @Query() query: PayrollQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.findAll(query, actor);
  }

  @Get('stats')
  @ApiOperation({
    summary:
      'Get payroll statistics (paid/advance/remaining totals) - superadmin, admin, manager',
  })
  getStatistics(
    @Query() query: PayrollStatsQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.getStatistics(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payroll by id - superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payroll - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.update(id, dto, actor);
  }

  @Patch(':id/pay')
  @ApiOperation({
    summary:
      'Record a salary payment (full or partial) - superadmin, admin, manager',
  })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPayrollPaymentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.recordPayment(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete payroll - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.delete(id, actor);
  }
}
