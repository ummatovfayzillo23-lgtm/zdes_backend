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
@Controller('payrolls')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  create(
    @Body() dto: CreatePayrollDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: PayrollQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.findAll(query, actor);
  }

  @Get('stats')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  getStatistics(
    @Query() query: PayrollStatsQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.getStatistics(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.update(id, dto, actor);
  }

  @Patch(':id/pay')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPayrollPaymentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.recordPayment(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.payrollService.delete(id, actor);
  }
}
