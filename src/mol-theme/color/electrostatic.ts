import { ColorTheme } from '../../mol-theme/color';
import { ThemeDataContext } from '../../mol-theme/theme';
import { Color, ColorScale } from '../../mol-util/color';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { AtomPartialCharge } from '../../mol-model-formats/structure/property/partial-charge';
import { StructureElement, Unit, Bond, ElementIndex } from '../../mol-model/structure';
import { ColorListName } from '../../mol-util/color/lists';


const DefaultPartialChargeColor = Color(0xffff99);

/**
 * TODO: Use these param values instead of passing
 *       custom params from another file
 */
export const ElectrostaticColorThemeParams = {
    domain: PD.Interval([0, 1]),
    charges: PD.Value([]),
    colorListLabel: PD.Text('blue-purple')
};

export type ElectrostaticColorThemeParams = typeof ElectrostaticColorThemeParams
export function getElectrostaticColorThemeParams(ctx: ThemeDataContext) {
    return ElectrostaticColorThemeParams;
}
function getPartialCharge(unit: Unit, element: ElementIndex) {
    return AtomPartialCharge.Provider.get(unit.model)?.data.value(element);
}

export function ElectroStaticColorTheme(ctx: ThemeDataContext, props: PD.Values<ElectrostaticColorThemeParams>): ColorTheme<ElectrostaticColorThemeParams> {
    const scale = ColorScale.create({
        domain: props.domain,
        listOrName: props.colorListLabel as ColorListName,
    });
    let charges = [...props.charges];

    return {
        factory: ElectroStaticColorTheme,
        granularity: 'group',
        color: location => {
            if (StructureElement.Location.is(location)) {
                if (charges && charges.length > 0) {
                    const q = charges.shift();
                    if (charges.length === 0 && props.charges) charges = [...props.charges];

                    return q !== undefined ? scale.color(q) : DefaultPartialChargeColor;
                } else {
                    const q = getPartialCharge(location.unit, location.element);
                    return q !== undefined ? scale.color(q) : DefaultPartialChargeColor;
                }

            } else if (Bond.isLocation(location)) {
                const q = getPartialCharge(location.aUnit, location.aUnit.elements[location.aIndex]);
                return q !== undefined ? scale.color(q) : DefaultPartialChargeColor;
            }
            return DefaultPartialChargeColor;
        },
        props: props,
        description: '',
    };
}

export const ElectroStaticColorThemeProvider: ColorTheme.Provider<ElectrostaticColorThemeParams, 'electrostatic'> = {
    name: 'electrostatic',
    label: 'Electrostatic',
    category: ColorTheme.Category.Misc,
    factory: ElectroStaticColorTheme,
    getParams: getElectrostaticColorThemeParams,
    defaultValues: PD.getDefaultValues(ElectrostaticColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => true,
};
