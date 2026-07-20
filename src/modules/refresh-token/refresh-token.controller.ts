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
import { CreateRefreshTokenDto } from './dto/create-refresh-token.dto';
import { RefreshTokenQueryDto } from './dto/refresh-token-query.dto';
import { UpdateRefreshTokenDto } from './dto/update-refresh-token.dto';
import { RefreshTokenService } from './refresh-token.service';

@ApiTags('Refresh Tokens')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('refresh-tokens')
export class RefreshTokenController {
  constructor(private readonly refreshTokenService: RefreshTokenService) {}

  @Post()
  @ApiOperation({
    summary: 'Create refresh token - superadmin, admin, manager',
  })
  create(
    @Body() dto: CreateRefreshTokenDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.refreshTokenService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get refresh tokens - superadmin, admin, manager' })
  findAll(
    @Query() query: RefreshTokenQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.refreshTokenService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get refresh token by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.refreshTokenService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update refresh token - superadmin, admin, manager',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRefreshTokenDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.refreshTokenService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete refresh token - superadmin, admin, manager',
  })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.refreshTokenService.delete(id, actor);
  }
}
