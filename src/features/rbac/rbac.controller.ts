// Types
import { Request, Response } from 'express';

class RbacControllerClass {
  async getAllUserAccess(req: Request, res: Response): Promise<void> {
    try {
      // const userAccess = await req.context.models.UserAccess.findAll({
      //     where: {
      //         userId: req.context.user.id
      //     }
      // });

      res.status(200).json({
        success: true,
        data: []
      });
    } catch (error) {
      res.status(500).json({
        error: 'Something went wrong'
      });
    }
  }
}

// Export an instance of the class
export const rbacController = new RbacControllerClass();

// Export individual methods for backward compatibility
export const getAllUserAccess = rbacController.getAllUserAccess.bind(rbacController);