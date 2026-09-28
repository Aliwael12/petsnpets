import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PetsService } from './pets.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createPetSchema, listPetsQuerySchema, type CreatePetDto, type ListPetsQueryDto } from './dto/pet.dto';

/** Open to every signed-in role (no @Roles): whoever checks a pet in for boarding or takes
 *  a client's details at the till may need to add the pet on the spot. */
@Controller('pets')
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listPetsQuerySchema)) query: ListPetsQueryDto) {
    return this.pets.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.pets.getOrThrow(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPetSchema)) dto: CreatePetDto) {
    return this.pets.create(dto);
  }
}
