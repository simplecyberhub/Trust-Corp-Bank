import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import beneficiariesRouter from "./beneficiaries";
import cardsRouter from "./cards";
import depositsRouter from "./deposits";
import notificationsRouter from "./notifications";
import exchangeRouter from "./exchange";
import adminRouter from "./admin";
import otpRouter from "./otp";
import supportRouter from "./support";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(beneficiariesRouter);
router.use(cardsRouter);
router.use(depositsRouter);
router.use(notificationsRouter);
router.use(exchangeRouter);
router.use(adminRouter);
router.use(otpRouter);
router.use(supportRouter);

export default router;
