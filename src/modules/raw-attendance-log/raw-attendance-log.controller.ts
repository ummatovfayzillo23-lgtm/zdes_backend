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
import { CreateRawAttendanceLogDto } from './dto/create-raw-attendance-log.dto';
import { RawAttendanceLogQueryDto } from './dto/raw-attendance-log-query.dto';
import { UpdateRawAttendanceLogDto } from './dto/update-raw-attendance-log.dto';
import { RawAttendanceLogService } from './raw-attendance-log.service';

@ApiTags('Raw Attendance Logs')
@Controller('raw-attendance-logs')
export class RawAttendanceLogController {
  constructor(
    private readonly rawAttendanceLogService: RawAttendanceLogService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  create(
    @Body() dto: CreateRawAttendanceLogDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.rawAttendanceLogService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: RawAttendanceLogQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.rawAttendanceLogService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.rawAttendanceLogService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRawAttendanceLogDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.rawAttendanceLogService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.rawAttendanceLogService.delete(id, actor);
  }
}
