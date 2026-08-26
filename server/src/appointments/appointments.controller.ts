import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentActor } from '../auth/actor.decorator';
import type { Actor } from '../auth/auth.types';
import {
  availabilityQuerySchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentStatusSchema,
  type AvailabilityQueryDto,
  type CreateAppointmentDto,
  type ListAppointmentsQueryDto,
  type UpdateAppointmentStatusDto,
} from './dto/appointment.dto';

/**
 * The `public/*` routes are the only unauthenticated surface the marketing website touches.
 * They are read-only apart from the booking POST, expose no stock/cost/client data, and the
 * POST is rate limited per IP because it is reachable by anyone on the internet.
 */
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Public()
  @Get('public/services')
  bookableServices() {
    return this.appointments.listBookableServices();
  }

  @Public()
  @Get('public/opening-hours')
  openingHours() {
    return this.appointments.openingHours();
  }

  @Public()
  @Get('public/availability')
  availability(@Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQueryDto) {
    return this.appointments.availability(query.date);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  // 10/minute per IP: far above what a real household booking for several pets needs,
  // low enough to stop a naive spam loop. A shared office NAT is the case to watch if
  // this is ever tightened.
  @RateLimit({ limit: 10, windowMs: 60_000, message: 'Too many booking requests. Please try again shortly, or call the clinic.' })
  @Post('public/appointments')
  @HttpCode(HttpStatus.CREATED)
  book(@Body(new ZodValidationPipe(createAppointmentSchema)) dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  // --- Staff-facing ---------------------------------------------------------

  @Get('appointments')
  @Roles('doctor', 'nurse')
  list(@Query(new ZodValidationPipe(listAppointmentsQuerySchema)) query: ListAppointmentsQueryDto) {
    return this.appointments.list(query);
  }

  @Patch('appointments/:id/status')
  @Roles('doctor', 'nurse')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAppointmentStatusSchema)) dto: UpdateAppointmentStatusDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.appointments.updateStatus(id, dto, actor);
  }
}
