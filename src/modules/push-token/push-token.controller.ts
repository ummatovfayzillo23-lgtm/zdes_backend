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
import { CreatePushTokenDto } from './dto/create-push-token.dto';
import { PushTokenQueryDto } from './dto/push-token-query.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { PushTokenService } from './push-token.service';

@ApiTags('Push Tokens')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('push-tokens')
export class PushTokenController {
  constructor(private readonly pushTokenService: PushTokenService) {}

  @Post()
  @ApiOperation({ summary: 'Create push token - superadmin, admin, manager' })
  create(
    @Body() dto: CreatePushTokenDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pushTokenService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get push tokens - superadmin, admin, manager' })
  findAll(
    @Query() query: PushTokenQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pushTokenService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get push token by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pushTokenService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update push token - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePushTokenDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pushTokenService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete push token - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.pushTokenService.delete(id, actor);
  }
}
