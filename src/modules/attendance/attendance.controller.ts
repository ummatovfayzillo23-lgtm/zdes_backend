import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { imageUploadOptions } from '../../common/upload/image-upload.util';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { AttendanceCheckInDto } from './dto/attendance-check-in.dto';
import { AttendanceCheckOutDto } from './dto/attendance-check-out.dto';
import { AttendanceKpiTemplateDto } from './dto/attendance-kpi-template.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { AttendanceSessionQueryDto } from './dto/attendance-session-query.dto';
import { SelfAttendanceCheckInDto } from './dto/self-attendance-check-in.dto';
import { SelfAttendanceCheckOutDto } from './dto/self-attendance-check-out.dto';
import { AttendanceService } from './services/attendance.service';

const ATTENDANCE_IMAGE_BODY = {
  schema: {
    type: 'object',
    properties: {
      notes: { type: 'string' },
      file: { type: 'string', format: 'binary' },
    },
  },
};

const CHECK_EVENT_BODY = {
  schema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' },
      terminalId: { type: 'string' },
      eventTime: { type: 'string' },
      notes: { type: 'string' },
      file: { type: 'string', format: 'binary' },
    },
  },
};

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('kpi-template/:companyId')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  getKpiTemplate(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.getKpiTemplate(companyId, actor);
  }

  @Put('kpi-template')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  upsertKpiTemplate(
    @Body() dto: AttendanceKpiTemplateDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.upsertKpiTemplate(dto, actor);
  }

  @Post('check-in')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiConsumes('multipart/form-data')
  @ApiBody(CHECK_EVENT_BODY)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('attendance')))
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  checkIn(
    @Body() dto: AttendanceCheckInDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.checkIn(dto, file, actor);
  }

  @Post('check-out')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiConsumes('multipart/form-data')
  @ApiBody(CHECK_EVENT_BODY)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('attendance')))
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  checkOut(
    @Body() dto: AttendanceCheckOutDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.checkOut(dto, file, actor);
  }

  @Post('self/check-in')
  @ApiBearerAuth()
  @Roles('employee')
  @ApiConsumes('multipart/form-data')
  @ApiBody(ATTENDANCE_IMAGE_BODY)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('attendance')))
  @ApiOperation({ summary: 'employee' })
  selfCheckIn(
    @Body() dto: SelfAttendanceCheckInDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.selfCheckIn(dto, file, actor);
  }

  @Post('self/check-out')
  @ApiBearerAuth()
  @Roles('employee')
  @ApiConsumes('multipart/form-data')
  @ApiBody(ATTENDANCE_IMAGE_BODY)
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('attendance')))
  @ApiOperation({ summary: 'employee' })
  selfCheckOut(
    @Body() dto: SelfAttendanceCheckOutDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.selfCheckOut(dto, file, actor);
  }

  @Get('self/sessions')
  @ApiBearerAuth()
  @Roles('employee')
  @ApiOperation({ summary: 'employee' })
  selfListSessions(
    @Query() query: AttendanceSessionQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.selfListSessions(query, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: AttendanceQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.attendanceService.findOne(id, actor);
  }
}
