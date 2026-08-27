import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { IngestTurnstileLogDto } from './dto/ingest-turnstile-log.dto';
import { TurnstileService } from './turnstile.service';

@ApiTags('Turnstile')
@Controller('turnstile')
export class TurnstileController {
  constructor(private readonly turnstileService: TurnstileService) {}

  @Public()
  @Post('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'public' })
  @ApiBody({ type: IngestTurnstileLogDto })
  ingestLog(
    @Body() body: IngestTurnstileLogDto,
    @Headers('x-turnstile-secret') sharedSecret?: string,
  ) {
    return this.turnstileService.ingestLog(body, sharedSecret);
  }
}
