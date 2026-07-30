import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ToggleCompanyStatusDto } from './dto/toggle-company-status.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const normalizedName = this.normalizeRequiredName(dto.name);
    await this.ensureNameIsUnique(normalizedName);

    return this.prisma.company.create({
      data: {
        name: normalizedName,
        legalName: trimToNull(dto.legalName),
        phone: trimToNull(dto.phone),
        email: trimToNull(dto.email),
        address: trimToNull(dto.address),
        logoUrl: trimToNull(dto.logoUrl),
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
      },
    });
  }

  async findAll(query: CompanyQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);

    const where: Prisma.CompanyWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { legalName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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
    return this.findCompanyByIdOrThrow(id);
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findCompanyByIdOrThrow(id);
    const normalizedName = dto.name ? this.normalizeRequiredName(dto.name) : undefined;

    if (normalizedName) {
      await this.ensureNameIsUnique(normalizedName, id);
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(dto.legalName !== undefined ? { legalName: trimToNull(dto.legalName) } : {}),
        ...(dto.phone !== undefined ? { phone: trimToNull(dto.phone) } : {}),
        ...(dto.email !== undefined ? { email: trimToNull(dto.email) } : {}),
        ...(dto.address !== undefined ? { address: trimToNull(dto.address) } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: trimToNull(dto.logoUrl) } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });
  }

  async toggleStatus(id: string, dto: ToggleCompanyStatusDto) {
    const company = await this.findCompanyByIdOrThrow(id);
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
    await this.findCompanyByIdOrThrow(id);
    await this.prisma.company.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findCompanyByIdOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async ensureNameIsUnique(name: string, excludedId?: string): Promise<void> {
    const existing = await this.prisma.company.findFirst({
      where: { name, ...(excludedId ? { id: { not: excludedId } } : {}) },
    });
    if (existing) throw new ConflictException('Company name already exists');
  }

  private normalizeRequiredName(name: string): string {
    const normalized = trimToNull(name);
    if (!normalized) throw new ConflictException('Company name is required');
    return normalized;
  }
}
