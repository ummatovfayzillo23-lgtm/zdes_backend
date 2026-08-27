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
import { AppVersionQueryDto } from './dto/app-version-query.dto';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';
import { AppVersionService } from './app-version.service';

@ApiTags('App Versions')
@Controller('app-versions')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  create(@Body() dto: CreateAppVersionDto) {
    return this.appVersionService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findAll(@Query() query: AppVersionQueryDto) {
    return this.appVersionService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appVersionService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppVersionDto,
  ) {
    return this.appVersionService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'superadmin, admin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.appVersionService.delete(id);
  }
}
