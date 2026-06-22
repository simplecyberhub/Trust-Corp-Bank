import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import beneficiariesRouter from "./beneficiaries";
import cardsRouter from "./cards";
import notificationsRouter from "./notifications";
import exchangeRouter from "./exchange";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(beneficiariesRouter);
router.use(cardsRouter);
router.use(notificationsRouter);
router.use(exchangeRouter);

export default router;
