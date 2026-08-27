import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TerminalStatus, TerminalType } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { TerminalQueryDto } from './dto/terminal-query.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';

type Search = { contains: string; mode: 'insensitive' };

type TerminalFilter = {
  companyId?: string;
  branchId?: string;
  type?: TerminalType;
  status?: TerminalStatus;
  OR?: { name?: Search; serialNumber?: Search }[];
};

type TerminalData = {
  companyId?: string;
  branchId?: string | null;
  name?: string;
  serialNumber?: string;
  ipAddress?: string | null;
  port?: number | null;
  type?: TerminalType;
  status?: TerminalStatus;
  connectionConfig?: Prisma.InputJsonValue;
  lastSyncAt?: Date | null;
};

@Injectable()
export class TerminalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTerminalDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    const scope = getScope(actor, { companyId, branchId: dto.branchId });

    await this.checkCompany(companyId);
    const branchId = await this.checkBranch(companyId, scope.branchId);

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    const serialNumber = trimToNull(dto.serialNumber);
    if (!serialNumber) {
      throw new ConflictException('Serial number is required');
    }
    await this.checkSerialUnique(serialNumber);

    const connectionConfig = dto.connectionConfig as
      Prisma.InputJsonValue | undefined;

    return this.prisma.terminal.create({
      data: {
        companyId,
        branchId,
        name,
        serialNumber,
        ipAddress: trimToNull(dto.ipAddress),
        port: dto.port,
        type: dto.type,
        status: dto.status,
        connectionConfig,
        lastSyncAt: dto.lastSyncAt ? new Date(dto.lastSyncAt) : undefined,
      },
    });
  }

  async findAll(query: TerminalQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: TerminalFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.branchId = scope.branchId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.terminal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.terminal.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    const terminal = await this.getTerminalById(id);
    checkAccess(actor, terminal);
    return terminal;
  }

  async update(id: string, dto: UpdateTerminalDto, actor: AccessTokenPayload) {
    const existing = await this.getTerminalById(id);
    checkAccess(actor, existing);

    const data: TerminalData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (dto.branchId !== undefined) {
      const scope = getScope(actor, { companyId, branchId: dto.branchId });
      data.branchId = await this.checkBranch(companyId, scope.branchId);
    } else if (dto.companyId !== undefined) {
      data.branchId = await this.checkBranch(companyId, existing.branchId);
    }

    if (dto.serialNumber !== undefined) {
      const serialNumber = trimToNull(dto.serialNumber);
      if (!serialNumber) {
        throw new ConflictException('Serial number is required');
      }
      await this.checkSerialUnique(serialNumber, id);
      data.serialNumber = serialNumber;
    }

    if (dto.name !== undefined) {
      const name = trimToNull(dto.name);
      if (!name) {
        throw new ConflictException('Name is required');
      }
      data.name = name;
    }
    if (dto.ipAddress !== undefined) {
      data.ipAddress = trimToNull(dto.ipAddress);
    }
    if (dto.port !== undefined) {
      data.port = dto.port;
    }
    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.connectionConfig !== undefined) {
      data.connectionConfig = dto.connectionConfig as Prisma.InputJsonValue;
    }
    if (dto.lastSyncAt !== undefined) {
      data.lastSyncAt = dto.lastSyncAt ? new Date(dto.lastSyncAt) : null;
    }

    return this.prisma.terminal.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const terminal = await this.getTerminalById(id);
    checkAccess(actor, terminal);
    await this.prisma.terminal.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getTerminalById(id: string) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id } });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }
    return terminal;
  }

  private async checkCompany(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private async checkBranch(
    companyId: string,
    branchId?: string | null,
  ): Promise<string | null> {
    if (branchId == null) {
      return null;
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.companyId !== companyId) {
      throw new ConflictException('Branch is not in this company');
    }
    return branch.id;
  }

  private async checkSerialUnique(
    serialNumber: string,
    excludedId?: string,
  ): Promise<void> {
    const terminal = await this.prisma.terminal.findFirst({
      where: excludedId
        ? { serialNumber, id: { not: excludedId } }
        : { serialNumber },
      select: { id: true },
    });
    if (terminal) {
      throw new ConflictException('Serial number already exists');
    }
  }
}
