import { NotFoundException, BadRequestException } from '@nestjs/common';

export class ApiKeyNotFoundException extends NotFoundException {
  constructor(id?: string) {
    super(id ? `API key with ID "${id}" not found` : 'API key not found');
  }
}

export class ApiKeyAlreadyRevokedException extends BadRequestException {
  constructor(id: string) {
    super(`API key with ID "${id}" is already revoked`);
  }
}
