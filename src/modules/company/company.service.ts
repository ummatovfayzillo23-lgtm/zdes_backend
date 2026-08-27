import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import { getFile, buildUploadUrl } from '../../common/upload/image-upload.util';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ToggleCompanyStatusDto } from './dto/toggle-company-status.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type Search = { contains: string; mode: 'insensitive' };

type CompanyFilter = {
  isActive?: boolean;
  OR?: { name?: Search; legalName?: Search; phone?: Search; email?: Search }[];
};

type CompanyData = {
  name?: string;
  legalName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  timezone?: string;
};

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    await this.checkNameUnique(name);

    return this.prisma.company.create({
      data: {
        name,
        legalName: trimToNull(dto.legalName),
        phone: trimToNull(dto.phone),
        email: trimToNull(dto.email),
        address: trimToNull(dto.address),
        timezone: dto.timezone || undefined,
      },
    });
  }

  async findAll(query: CompanyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: CompanyFilter = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    return this.getCompanyById(id);
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.getCompanyById(id);

    const data: CompanyData = {};

    if (dto.name !== undefined) {
      const name = trimToNull(dto.name);
      if (!name) {
        throw new ConflictException('Name is required');
      }
      await this.checkNameUnique(name, id);
      data.name = name;
    }
    if (dto.legalName !== undefined) {
      data.legalName = trimToNull(dto.legalName);
    }
    if (dto.phone !== undefined) {
      data.phone = trimToNull(dto.phone);
    }
    if (dto.email !== undefined) {
      data.email = trimToNull(dto.email);
    }
    if (dto.address !== undefined) {
      data.address = trimToNull(dto.address);
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone;
    }

    return this.prisma.company.update({ where: { id }, data });
  }

  async updateLogo(id: string, file?: Express.Multer.File) {
    await this.getCompanyById(id);
    const uploaded = getFile(file);

    return this.prisma.company.update({
      where: { id },
      data: { logoUrl: buildUploadUrl('logos', uploaded.filename) },
    });
  }

  async toggleStatus(id: string, dto: ToggleCompanyStatusDto) {
    const company = await this.getCompanyById(id);
    const nextIsActive = dto.isActive ?? !company.isActive;

    return this.prisma.company.update({
      where: { id },
      data: {
        isActive: nextIsActive,
        stoppedAt: nextIsActive ? null : new Date(),
      },
    });
  }

  async delete(id: string) {
    await this.getCompanyById(id);
    await this.prisma.company.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getCompanyById(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  private async checkNameUnique(
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.company.findFirst({
      where: excludedId ? { name, id: { not: excludedId } } : { name },
    });
    if (existing) {
      throw new ConflictException('Name already exists');
    }
  }
}
