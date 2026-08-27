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
import { CreateSalaryAdjustmentDto } from './dto/create-salary-adjustment.dto';
import { SalaryAdjustmentQueryDto } from './dto/salary-adjustment-query.dto';
import { UpdateSalaryAdjustmentDto } from './dto/update-salary-adjustment.dto';
import { SalaryAdjustmentService } from './salary-adjustment.service';

@ApiTags('Salary Adjustments')
@Controller('salary-adjustments')
export class SalaryAdjustmentController {
  constructor(
    private readonly salaryAdjustmentService: SalaryAdjustmentService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  create(
    @Body() dto: CreateSalaryAdjustmentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.salaryAdjustmentService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: SalaryAdjustmentQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.salaryAdjustmentService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.salaryAdjustmentService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryAdjustmentDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.salaryAdjustmentService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.salaryAdjustmentService.delete(id, actor);
  }
}
