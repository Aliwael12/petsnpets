import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  createEmployeeSchema,
  updateEmployeeFeaturesSchema,
  updateEmployeeRoleSchema,
  type CreateEmployeeDto,
  type UpdateEmployeeFeaturesDto,
  type UpdateEmployeeRoleDto,
} from './dto/employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  /** Pre-login picker — name/role only, never a PIN hash. */
  @Public()
  @Get('active')
  listActive() {
    return this.employees.listActive();
  }

  @Get()
  @Roles('doctor')
  list() {
    return this.employees.list();
  }

  @Post()
  @Roles('doctor')
  create(@Body(new ZodValidationPipe(createEmployeeSchema)) dto: CreateEmployeeDto, @CurrentActor() actor: Actor) {
    return this.employees.create(dto, actor);
  }

  @Patch(':id/toggle-active')
  @Roles('doctor')
  toggleActive(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.employees.toggleActive(id, actor);
  }

  @Patch(':id/role')
  @Roles('doctor')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEmployeeRoleSchema)) dto: UpdateEmployeeRoleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.employees.updateRole(id, dto, actor);
  }

  @Patch(':id/features')
  @Roles('doctor')
  updateFeatures(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEmployeeFeaturesSchema)) dto: UpdateEmployeeFeaturesDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.employees.updateFeatures(id, dto, actor);
  }

  @Delete(':id')
  @Roles('doctor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    await this.employees.remove(id, actor);
  }
}
