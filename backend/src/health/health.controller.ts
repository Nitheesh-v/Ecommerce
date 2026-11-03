import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      success: true,
      message: 'E-commerce API is running',
      timestamp: new Date().toISOString(),
    };
  }
}