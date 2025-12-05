import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

@Module({
  imports: [
    ApiKeyModule.register({
      secretLength: 32,
      headerName: 'x-api-key',
    }),
  ],
})
export class AppModule {}

