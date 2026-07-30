/**
 * Vehicle Type Specs
 *
 * @description Fixed per-type dimensions/capacity, confirmed against all
 * existing driver records — every driver of a given vehicleType has
 * identical BTM/BDM/payload/dimensions/pallet4x3, so a 3rd-party driver
 * self-registering only needs to pick their truck's type; the rest is
 * auto-filled from here rather than typed in by hand.
 */

export type VehicleTypeSpec = {
  btm: string;
  bdm: string;
  payload: string;
  length: string;
  width: string;
  height: string;
  pallet4x3: string;
};

export const VEHICLE_TYPE_SPECS: Record<string, VehicleTypeSpec> = {
  '1-Ton Van':    { btm: '2010.00',  bdm: '3600.00',  payload: '1431.00',  length: '10ft', width: '6ft', height: '6ft', pallet4x3: '4.00' },
  '3-Ton Lorry':  { btm: '3230.00',  bdm: '5000.00',  payload: '1593.00',  length: '14ft', width: '7ft', height: '7ft', pallet4x3: '6.00' },
  '5-Ton Lorry':  { btm: '3390.00',  bdm: '5000.00',  payload: '1449.00',  length: '17ft', width: '7ft', height: '7ft', pallet4x3: '8.00' },
  '10-Ton Lorry': { btm: '10430.00', bdm: '25000.00', payload: '13113.00', length: '29ft', width: '8ft', height: '8ft', pallet4x3: '16.00' },
  '40Ft Trailer': { btm: '15310.00', bdm: '37000.00', payload: '19521.00', length: '41ft', width: '8ft', height: '8ft', pallet4x3: '24.00' },
};

export const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_SPECS);
