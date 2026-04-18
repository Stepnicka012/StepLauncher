export interface PickerValue {
    getValue: () => string | number;
    setValue?: (value: string | number) => void;
    onChange?: (callback: (val: any) => void) => void;
    pause?: () => void;
    resume?: () => void;
    destroy?: () => void;
}
