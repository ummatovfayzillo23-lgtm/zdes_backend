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
import { AdvanceService } from './advance.service';
import { AdvanceQueryDto } from './dto/advance-query.dto';
import { CreateAdvanceDto } from './dto/create-advance.dto';
import { UpdateAdvanceDto } from './dto/update-advance.dto';

@ApiTags('Advances')
@Controller('advances')
export class AdvanceController {
  constructor(private readonly advanceService: AdvanceService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  create(
    @Body() dto: CreateAdvanceDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.advanceService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: AdvanceQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.advanceService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.advanceService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdvanceDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.advanceService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.advanceService.delete(id, actor);
  }
}
