const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { handleValidationErrors } = require('../middlewares/validation.middleware');
const {
  signupValidation,
  loginValidation,
  refreshValidation,
  forgotPassword,
  resetPasswordValidation,
  changePasswordValidation,
} = require('../validators/auth.validator');

router.post('/signup', signupValidation, handleValidationErrors, ctrl.signup);
router.post('/login', loginValidation, handleValidationErrors, ctrl.login);
router.get('/me', authMiddleware, ctrl.me);
router.post('/refresh', refreshValidation, handleValidationErrors, ctrl.refresh);
router.post('/logout', refreshValidation, handleValidationErrors, ctrl.logout);
router.post('/forgot-password', forgotPassword, handleValidationErrors, ctrl.forgotPassword);
router.post('/reset-password', resetPasswordValidation, handleValidationErrors, ctrl.resetPasswordController);
router.post('/change-password', authMiddleware, changePasswordValidation, handleValidationErrors, ctrl.changePasswordController);

module.exports = router;
