import { envs } from './../config/envs';
import { Controller, Get } from '@nestjs/common';

@Controller('/')
export class HealthCheckController {
  @Get()
  healthCheck() {
    return {
      message: `payments webhook is up and running on port: [${envs.port}]`,
    };
  }
}
