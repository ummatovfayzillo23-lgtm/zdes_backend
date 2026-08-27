import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { imageUploadOptions } from '../../common/upload/image-upload.util';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ToggleCompanyStatusDto } from './dto/toggle-company-status.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyService } from './company.service';

@ApiTags('Companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companyService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  findAll(@Query() query: CompanyQueryDto) {
    return this.companyService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companyService.update(id, dto);
  }

  @Post(':id/logo')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageUploadOptions('logos')))
  uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companyService.updateLogo(id, file);
  }

  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleCompanyStatusDto,
  ) {
    return this.companyService.toggleStatus(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles('superadmin')
  @ApiOperation({ summary: 'superadmin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.delete(id);
  }
}
