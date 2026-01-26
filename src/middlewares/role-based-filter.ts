import { Request, Response, NextFunction } from 'express';
import { getAdminDataByToken } from '../features/admin/admin.repository.js';
import { Error } from '../error/index.js';
import { getUserRoleWithRole } from '../features/rbac/rbac.repository.js';
import { AgencyInsuranceWithNameType } from '../features/agency_insurance/agency_insurance.model.js';
import { getUserAgencyWithName } from '../features/user_agency/user_agency.repository.js';
import { getAgencyInsuranceWithName } from '../features/agency_insurance/agency_insurance.repository.js';

const roleGroup = {
    ADMIN: 'Admin',
    AGENT: 'Agent',
    INSURER: 'Insurer',
}

/**
 * Middleware to filter response data based on user role.
 */
export const roleBasedFilter = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract token from Authorization header
        const token = req.header('Authorization')?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: Error.UNAUTHORIZED });
        }

        // Get admin data from the token
        const adminData = await getAdminDataByToken(token);
        if (!adminData) {
            return res.status(401).json({ message: Error.UNAUTHORIZED });
        }

        const { password, ...admin } = adminData;

        const agency = await getUserAgencyWithName({ adminId: admin.adminId });

        const selectedCompanyId = req.query.selectedCompanyId as string | undefined;
    
        let insuranceCompany: AgencyInsuranceWithNameType[] = [];
        if (agency.length > 0) {
            const companyData = await getAgencyInsuranceWithName({ agencyId: agency[0].agencyId });
        
            // Filter out companies with no name
            const validCompanies = companyData.filter(
                (company): company is (typeof company & { companyName: string }) =>
                    company.companyName !== null
            );
        
            // Use selectedCompanyId if provided and exists
            if (selectedCompanyId) {
                const matchedCompany = validCompanies.find(c => c.companyId === selectedCompanyId);
                if (matchedCompany) {
                    insuranceCompany = [{
                        companyId: matchedCompany.companyId,
                        companyName: matchedCompany.companyName,
                    }];
                }
            }
        
            // If no selectedCompanyId, fallback to all valid companies
            if (insuranceCompany.length === 0) {
                insuranceCompany = validCompanies.map(company => ({
                    companyId: company.companyId,
                    companyName: company.companyName,
                }));
            }
        }

        // Fetch user roles
        const userRoles = await getUserRoleWithRole(adminData.adminId);
        const roleNames = [...new Set(userRoles.map(role => role.roleName))];
        
        const query = req.query;

        if (roleNames.includes(roleGroup.ADMIN)) {
            return next();
        }

        // if no roles found, return empty array
        if (roleNames.length === 0) {
            return res.status(200).json({ success: true, message: 'No roles found', data: [] });
        }
        
        // add agencyId to query
        if (agency.length > 1) {
            query.agencyId = agency.map(ag => ag.agencyId);
        } else if (agency.length === 1) {
            query.agencyId = agency[0].agencyId;
        }

        // add agency insurance companyId to query
        if (insuranceCompany.length > 1) {
            query.companyId = insuranceCompany.map(company => company.companyId);
        } else if (insuranceCompany.length === 1) {
            query.companyId = insuranceCompany[0].companyId;
        }

        // add insurance companyId to query
        if (adminData.companyId) {
            query.companyId = adminData.companyId;
        }

        // ✅ Always call `next()` to continue request processing
        next();
    } catch (error) {
        console.error("Error in role-based filter:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
