import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  clientPetsQuerySchema,
  createReminderSchema,
  listRemindersQuerySchema,
  type ClientPetsQueryDto,
  type CreateReminderDto,
  type ListRemindersQueryDto,
} from './dto/reminder.dto';

/** Open to every signed-in role on purpose (no @Roles): whoever answers the phone or works
 *  the till is often the one who needs to leave a follow-up for a client. */
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listRemindersQuerySchema)) query: ListRemindersQueryDto) {
    return this.reminders.list(query);
  }

  @Get('pets')
  petsForClient(@Query(new ZodValidationPipe(clientPetsQuerySchema)) query: ClientPetsQueryDto) {
    return this.reminders.petsForClient(query.clientId);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createReminderSchema)) dto: CreateReminderDto, @CurrentActor() actor: Actor) {
    return this.reminders.create(dto, actor);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.reminders.complete(id, actor);
  }
}
