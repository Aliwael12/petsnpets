import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type CreateClientDto,
  type ListClientsQueryDto,
  type UpdateClientDto,
} from './dto/client.dto';

@Controller('clients')
@Roles('doctor', 'nurse')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  // Checkout requires every role — including cashiers — to search for or create the
  // client a sale is linked to, so list/create override the class-level doctor/nurse
  // restriction. Editing and deleting client records stays doctor/nurse only.
  @Get()
  @Roles('doctor', 'nurse', 'cashier')
  list(@Query(new ZodValidationPipe(listClientsQuerySchema)) query: ListClientsQueryDto) {
    return this.clients.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.getOrThrow(id);
  }

  @Post()
  @Roles('doctor', 'nurse', 'cashier')
  create(@Body(new ZodValidationPipe(createClientSchema)) dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateClientSchema)) dto: UpdateClientDto, @CurrentActor() actor: Actor) {
    return this.clients.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.clients.remove(id, actor);
  }
}
