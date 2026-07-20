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
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create position - superadmin, admin (own company), manager (own branch, departmentId required)',
  })
  create(
    @Body() dto: CreatePositionDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary:
      'Get positions - superadmin (all), admin (own company), manager (own branch)',
  })
  findAll(
    @Query() query: PositionQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get position by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update position - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({
    summary: 'Toggle position status - superadmin, admin, manager',
  })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TogglePositionStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.toggleStatus(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete position - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.positionService.delete(id, actor);
  }
}
