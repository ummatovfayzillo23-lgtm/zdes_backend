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
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayService } from './holiday.service';

@ApiTags('Holidays')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('holidays')
export class HolidayController {
  constructor(private readonly holidayService: HolidayService) {}

  @Post()
  @ApiOperation({ summary: 'Create holiday - superadmin, admin, manager' })
  create(
    @Body() dto: CreateHolidayDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.holidayService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get holidays - superadmin, admin, manager' })
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.holidayService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get holiday by id - superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.holidayService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update holiday - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHolidayDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.holidayService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete holiday - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.holidayService.delete(id, actor);
  }
}
