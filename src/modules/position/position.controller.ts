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
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { TogglePositionStatusDto } from './dto/toggle-position-status.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionService } from './position.service';

@ApiTags('Positions')
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  create(
    @Body() dto: CreatePositionDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.create(dto, actor);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findAll(
    @Query() query: PositionQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.findAll(query, actor);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TogglePositionStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.toggleStatus(id, dto, actor);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.delete(id, actor);
  }
}
