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
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ToggleBranchStatusDto } from './dto/toggle-branch-status.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchService } from './branch.service';

@ApiTags('Branches')
@ApiBearerAuth()
@Roles('superadmin', 'admin')
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create branch - superadmin, admin (own company)' })
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.create(dto, actor);
  }

  @Get()
  @ApiOperation({
    summary: 'Get branches - superadmin (all), admin (own company)',
  })
  findAll(
    @Query() query: BranchQueryDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.findAll(query, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch by id - superadmin, admin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.findOne(id, actor);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update branch - superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.update(id, dto, actor);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle branch status - superadmin, admin' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleBranchStatusDto,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.toggleStatus(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete branch - superadmin, admin' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ) {
    return this.branchService.delete(id, actor);
  }
}
