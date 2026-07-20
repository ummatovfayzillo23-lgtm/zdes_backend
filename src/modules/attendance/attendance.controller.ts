import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { AttendanceCheckInDto } from './dto/attendance-check-in.dto';
import { AttendanceCheckOutDto } from './dto/attendance-check-out.dto';
import { AttendanceKpiTemplateDto } from './dto/attendance-kpi-template.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceService } from './services/attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('kpi-template/:companyId')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get attendance KPI template - superadmin, admin' })
  getKpiTemplate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.getKpiTemplate(companyId, actor);
  }

  @Put('kpi-template')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Save attendance KPI template - superadmin, admin' })
  upsertKpiTemplate(
    @Body() dto: AttendanceKpiTemplateDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.upsertKpiTemplate(dto, actor);
  }

  @Post('check-in')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Check in with AWS face verification - superadmin, admin, manager',
  })
  checkIn(
    @Body() dto: AttendanceCheckInDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.checkIn(dto, actor);
  }

  @Post('check-out')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary:
      'Check out with AWS face verification - superadmin, admin, manager',
  })
  checkOut(
    @Body() dto: AttendanceCheckOutDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.checkOut(dto, actor);
  }

  @Get()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get attendance list - superadmin, admin, manager' })
  findAll(
    @Query() query: AttendanceQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.findAll(query, actor);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Get attendance by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.findOne(id, actor);
  }
}
