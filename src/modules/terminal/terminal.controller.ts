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
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { TerminalQueryDto } from './dto/terminal-query.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';
import { TerminalService } from './terminal.service';

@ApiTags('Terminals')
@ApiBearerAuth()
@Roles('superadmin', 'admin', 'manager')
@Controller('terminals')
export class TerminalController {
  constructor(private readonly terminalService: TerminalService) {}

  @Post()
  @ApiOperation({ summary: 'Create terminal - superadmin, admin, manager' })
  create(
    @Body() dto: CreateTerminalDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.terminalService.create(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get terminals - superadmin, admin, manager' })
  findAll(
    @Query() query: TerminalQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.terminalService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get terminal by id - superadmin, admin, manager' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.terminalService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update terminal - superadmin, admin, manager' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTerminalDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.terminalService.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete terminal - superadmin, admin, manager' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.terminalService.delete(id, actor);
  }
}
