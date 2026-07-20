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
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Create notification - superadmin, admin, manager' })
  create(
    @Body() dto: CreateNotificationDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.notificationService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get notifications - superadmin, admin, manager' })
  findAll(
    @Query() query: NotificationQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.notificationService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get notification by id - superadmin, admin, manager',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.notificationService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update notification - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.notificationService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.notificationService.delete(id, actor);
  }
}
