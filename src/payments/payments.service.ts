import { NATS_SERVICE } from './../config/services';
import { envs } from './../config/envs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session-dto';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const linesItems = items.map((item) => {
      return {
        price_data: {
          currency: currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100), // 20 dolares => 2000 /100 = 20.00
        },
        quantity: item.quantity,
      };
    });

    const session = await this.stripe.checkout.sessions.create({
      // Colocar ID de la orden
      payment_intent_data: {
        metadata: {
          orderId,
        },
      },

      line_items: linesItems,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });

    // return session;
    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  stripeWebhook(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      console.log('⚠️  No signature found in request headers');
      return res.sendStatus(400);
    }

    let event: Stripe.Event;
    // Testing
    // const endpointSecret =
    //   'whsec_1eefe67331b6af41f12daab9c57c91f19f4e2bbc027934a717d3ba4c1c9df306';

    //Real
    const endpointSecret = envs.stripeEndpointSecret;

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        signature,
        endpointSecret,
      );
    } catch (err) {
      console.log(
        `⚠️  Webhook signature verification failed.`,
        (err as { message: string }).message,
      );
      return res.sendStatus(400);
    }

    switch (event.type) {
      case 'charge.succeeded': {
        const chargeSucceeded = event.data.object;
        // TODO: llamar nuestro ms
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };

        // this.logger.log({ payload });
        this.client.emit('payment.succeeded', payload);

        break;
      }
      default:
        console.log(`Evento ${event.type} not handler`);
    }

    return res.status(200).json({ signature });
  }
}
